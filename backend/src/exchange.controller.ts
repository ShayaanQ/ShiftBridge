import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ClaimStatus, PostingStatus, Prisma, Role } from '@prisma/client';
import { IsString } from 'class-validator';
import { JwtAuthGuard, Roles, RolesGuard } from './auth';
import { PrismaService } from './prisma.service';

class PostShiftDto { @IsString() shiftId!: string; }

type Db = Prisma.TransactionClient;

@Injectable() export class ExchangeService {
  constructor(private prisma: PrismaService) {}

  async postShift(actorId: string, shiftId: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.assignedUserId !== actorId) throw new ForbiddenException('You can post only your own shift');
    if (shift.startAt <= new Date()) throw new BadRequestException('Only future shifts can be posted');
    const existing = await this.prisma.shiftPosting.findUnique({ where: { shiftId } });
    if (existing && (existing.status === PostingStatus.OPEN || existing.status === PostingStatus.PENDING_APPROVAL)) throw new BadRequestException('Shift already has an active posting');
    return this.prisma.$transaction(async (tx) => {
      const posting = existing
        ? await tx.shiftPosting.update({ where: { id: existing.id }, data: { postedById: actorId, status: PostingStatus.OPEN } })
        : await tx.shiftPosting.create({ data: { shiftId, postedById: actorId } });
      await tx.auditEvent.create({ data: { actorId, action: 'SHIFT_POSTED', entityType: 'ShiftPosting', entityId: posting.id } });
      return { id: posting.id, shiftId: posting.shiftId, status: posting.status };
    });
  }

  async available(actorId: string) {
    return this.prisma.shiftPosting.findMany({
      where: { status: PostingStatus.OPEN, shift: { assignedUserId: { not: actorId } } },
      select: { id: true, shiftId: true, status: true, shift: { select: { startAt: true, endAt: true, assignedUser: { select: { name: true, email: true } } } } },
      orderBy: { shift: { startAt: 'asc' } },
    });
  }

  private async assertClaimAllowed(tx: Db, claimantId: string, postingId: string) {
    // Lock serializes competing claim attempts for this posting in PostgreSQL.
    await tx.$queryRaw`SELECT "id" FROM "ShiftPosting" WHERE "id" = ${postingId} FOR UPDATE`;
    const posting = await tx.shiftPosting.findUnique({ where: { id: postingId }, include: { shift: true } });
    if (!posting) throw new NotFoundException('Posting not found');
    if (posting.status !== PostingStatus.OPEN) throw new BadRequestException('Posting is no longer open');
    if (posting.shift.assignedUserId === claimantId) throw new BadRequestException('You cannot claim your own shift');
    const available = await tx.availability.findFirst({ where: { userId: claimantId, startAt: { lte: posting.shift.startAt }, endAt: { gte: posting.shift.endAt } } });
    if (!available) throw new BadRequestException('You are not available for the full shift');
    const conflict = await tx.shift.findFirst({ where: { assignedUserId: claimantId, startAt: { lt: posting.shift.endAt }, endAt: { gt: posting.shift.startAt } } });
    if (conflict) throw new BadRequestException('You have an overlapping assigned shift');
    return posting;
  }

  async claim(actorId: string, postingId: string) {
    return this.prisma.$transaction(async (tx) => {
      const posting = await this.assertClaimAllowed(tx, actorId, postingId);
      const claim = await tx.shiftClaim.create({ data: { postingId: posting.id, claimantId: actorId, status: ClaimStatus.PENDING } });
      await tx.shiftPosting.update({ where: { id: posting.id }, data: { status: PostingStatus.PENDING_APPROVAL } });
      await tx.auditEvent.create({ data: { actorId, action: 'SHIFT_CLAIMED', entityType: 'ShiftClaim', entityId: claim.id } });
      return { id: claim.id, postingId: claim.postingId, status: claim.status };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async pendingClaims() {
    return this.prisma.shiftClaim.findMany({
      where: { status: ClaimStatus.PENDING, posting: { status: PostingStatus.PENDING_APPROVAL } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, status: true,
        posting: { select: { id: true, shiftId: true, shift: { select: { startAt: true, endAt: true, assignedUser: { select: { name: true, email: true } } } } } },
        claimant: { select: { name: true, email: true } },
      },
    });
  }

  async approve(managerId: string, claimId: string) {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.shiftClaim.findUnique({ where: { id: claimId }, include: { claimant: true, posting: { include: { shift: true } } } });
      if (!claim) throw new NotFoundException('Claim not found');
      if (claim.status !== ClaimStatus.PENDING || claim.posting.status !== PostingStatus.PENDING_APPROVAL) throw new BadRequestException('Claim cannot be approved');
      const ownerId = claim.posting.shift.assignedUserId;
      await tx.shift.update({ where: { id: claim.posting.shiftId }, data: { assignedUserId: claim.claimantId } });
      await tx.shiftClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.APPROVED } });
      await tx.shiftPosting.update({ where: { id: claim.postingId }, data: { status: PostingStatus.COMPLETED } });
      await tx.notification.createMany({ data: [{ userId: claim.claimantId, message: 'Your shift claim was approved.' }, { userId: ownerId, message: 'Your posted shift was transferred to a coworker.' }] });
      await tx.auditEvent.create({ data: { actorId: managerId, action: 'CLAIM_APPROVED', entityType: 'ShiftClaim', entityId: claim.id } });
      return { id: claim.id, status: ClaimStatus.APPROVED };
    });
  }

  async reject(managerId: string, claimId: string) {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.shiftClaim.findUnique({ where: { id: claimId }, include: { posting: true } });
      if (!claim) throw new NotFoundException('Claim not found');
      if (claim.status !== ClaimStatus.PENDING || claim.posting.status !== PostingStatus.PENDING_APPROVAL) throw new BadRequestException('Claim cannot be rejected');
      await tx.shiftClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.REJECTED } });
      await tx.shiftPosting.update({ where: { id: claim.postingId }, data: { status: PostingStatus.OPEN } });
      await tx.notification.create({ data: { userId: claim.claimantId, message: 'Your shift claim was rejected.' } });
      await tx.auditEvent.create({ data: { actorId: managerId, action: 'CLAIM_REJECTED', entityType: 'ShiftClaim', entityId: claim.id } });
      return { id: claim.id, status: ClaimStatus.REJECTED };
    });
  }

  notifications(userId: string) { return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }); }
  audit() { return this.prisma.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, select: { action: true, entityType: true, entityId: true, createdAt: true, actor: { select: { name: true, email: true } } } }); }
}

@Controller() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.EMPLOYEE)
export class ExchangeController {
  constructor(private exchange: ExchangeService) {}
  @Post('shift-postings') post(@Req() req: any, @Body() dto: PostShiftDto) { return this.exchange.postShift(req.user.sub, dto.shiftId); }
  @Get('shift-postings/available') available(@Req() req: any) { return this.exchange.available(req.user.sub); }
  @Post('shift-postings/:postingId/claim') claim(@Req() req: any, @Param('postingId') postingId: string) { return this.exchange.claim(req.user.sub, postingId); }
  @Get('notifications') notifications(@Req() req: any) { return this.exchange.notifications(req.user.sub); }
}

@Controller('manager') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.MANAGER)
export class ManagerController {
  constructor(private exchange: ExchangeService) {}
  @Get('claims/pending') pending() { return this.exchange.pendingClaims(); }
  @Post('claims/:claimId/approve') approve(@Req() req: any, @Param('claimId') claimId: string) { return this.exchange.approve(req.user.sub, claimId); }
  @Post('claims/:claimId/reject') reject(@Req() req: any, @Param('claimId') claimId: string) { return this.exchange.reject(req.user.sub, claimId); }
  @Get('audit') audit() { return this.exchange.audit(); }
}
