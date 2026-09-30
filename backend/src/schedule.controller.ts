import { BadRequestException, Body, Controller, Get, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { IsISO8601, IsString } from 'class-validator';
import { parse } from 'csv-parse/sync';
import { Role } from '@prisma/client';
import { JwtAuthGuard, Roles, RolesGuard } from './auth';
import { PrismaService } from './prisma.service';
class AvailabilityDto { @IsISO8601() startAt!: string; @IsISO8601() endAt!: string; }
class ImportDto { @IsString() csv!: string; }
@Injectable() export class ScheduleService {
  constructor(private prisma: PrismaService) {}
  async list(userId: string) { return this.prisma.shift.findMany({ where: { assignedUserId: userId }, orderBy: { startAt: 'asc' } }); }
  async addAvailability(userId: string, dto: AvailabilityDto) { const startAt = new Date(dto.startAt), endAt = new Date(dto.endAt); if (endAt <= startAt) throw new BadRequestException('endAt must be after startAt'); return this.prisma.availability.create({ data: { userId, startAt, endAt } }); }
  async listAvailability(userId: string) { return this.prisma.availability.findMany({ where: { userId }, orderBy: { startAt: 'asc' } }); }
  async importCsv(actorId: string, csv: string) {
    let rows: Array<{ employeeEmail: string; startAt: string; endAt: string }>;
    try { rows = parse(csv, { columns: ['employeeEmail', 'startAt', 'endAt'], skip_empty_lines: true, trim: true }); } catch { throw new BadRequestException('Invalid CSV'); }
    if (!rows.length) throw new BadRequestException('CSV must contain at least one row');
    const items = await Promise.all(rows.map(async (row) => { const startAt = new Date(row.startAt), endAt = new Date(row.endAt); if (!row.employeeEmail || Number.isNaN(+startAt) || Number.isNaN(+endAt) || endAt <= startAt) throw new BadRequestException('Each row needs employeeEmail, valid timestamps, and endAt after startAt'); const employee = await this.prisma.user.findUnique({ where: { email: row.employeeEmail } }); if (!employee || employee.role !== Role.EMPLOYEE) throw new BadRequestException(`Unknown employee: ${row.employeeEmail}`); return { assignedUserId: employee.id, startAt, endAt }; }));
    return this.prisma.$transaction(async (tx) => { const created = await tx.shift.createMany({ data: items }); await tx.auditEvent.create({ data: { actorId, action: 'SCHEDULE_IMPORTED', entityType: 'Schedule', entityId: `import:${Date.now()}` } }); return { created: created.count }; });
  }
}
@Controller() @UseGuards(JwtAuthGuard, RolesGuard)
export class ScheduleController {
  constructor(private schedule: ScheduleService) {}
  @Get('shifts/me') myShifts(@Req() req: any) { return this.schedule.list(req.user.sub); }
  @Get('availability') availability(@Req() req: any) { return this.schedule.listAvailability(req.user.sub); }
  @Post('availability') addAvailability(@Req() req: any, @Body() dto: AvailabilityDto) { return this.schedule.addAvailability(req.user.sub, dto); }
  @Post('manager/schedule-import') @Roles(Role.MANAGER) importCsv(@Req() req: any, @Body() dto: ImportDto) { return this.schedule.importCsv(req.user.sub, dto.csv); }
}
