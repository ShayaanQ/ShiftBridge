import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClaimStatus, PostingStatus } from '@prisma/client';
import { ExchangeService } from './exchange.controller';

const future = new Date('2030-10-05T09:00:00Z');
const end = new Date('2030-10-05T17:00:00Z');

describe('ExchangeService', () => {
  let prisma: any;
  let service: ExchangeService;
  const tx: any = {};
  beforeEach(() => {
    tx.$queryRaw = jest.fn();
    tx.shiftPosting = { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() };
    tx.shiftClaim = { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() };
    tx.shift = { findFirst: jest.fn(), update: jest.fn() };
    tx.availability = { findFirst: jest.fn() };
    tx.auditEvent = { create: jest.fn() };
    tx.notification = { create: jest.fn(), createMany: jest.fn() };
    prisma = {
      shift: { findUnique: jest.fn(), findFirst: jest.fn() },
      shiftPosting: { findUnique: jest.fn(), findMany: jest.fn() },
      shiftClaim: { findMany: jest.fn() },
      notification: { findMany: jest.fn() }, auditEvent: { findMany: jest.fn() },
      $transaction: jest.fn((work: any) => work(tx)),
    };
    service = new ExchangeService(prisma);
  });

  it('employee posts their own future shift', async () => {
    prisma.shift.findUnique.mockResolvedValue({ id: 'shift-1', assignedUserId: 'owner', startAt: future });
    prisma.shiftPosting.findUnique.mockResolvedValue(null);
    tx.shiftPosting.create.mockResolvedValue({ id: 'posting-1', shiftId: 'shift-1', status: PostingStatus.OPEN });
    await expect(service.postShift('owner', 'shift-1')).resolves.toEqual({ id: 'posting-1', shiftId: 'shift-1', status: PostingStatus.OPEN });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'SHIFT_POSTED' }) });
  });

  it('employee cannot post another employee’s shift', async () => {
    prisma.shift.findUnique.mockResolvedValue({ id: 'shift-1', assignedUserId: 'owner', startAt: future });
    await expect(service.postShift('other', 'shift-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a claim outside availability', async () => {
    tx.shiftPosting.findUnique.mockResolvedValue({ id: 'posting-1', status: PostingStatus.OPEN, shift: { assignedUserId: 'owner', startAt: future, endAt: end } });
    tx.availability.findFirst.mockResolvedValue(null);
    await expect(service.claim('claimant', 'posting-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).toHaveBeenCalled();
  });

  it('rejects a claim with an overlapping assigned shift', async () => {
    tx.shiftPosting.findUnique.mockResolvedValue({ id: 'posting-1', status: PostingStatus.OPEN, shift: { assignedUserId: 'owner', startAt: future, endAt: end } });
    tx.availability.findFirst.mockResolvedValue({ id: 'available' });
    tx.shift.findFirst.mockResolvedValue({ id: 'conflict' });
    await expect(service.claim('claimant', 'posting-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a pending claim, changes posting state, and audits it', async () => {
    tx.shiftPosting.findUnique.mockResolvedValue({ id: 'posting-1', status: PostingStatus.OPEN, shift: { assignedUserId: 'owner', startAt: future, endAt: end } });
    tx.availability.findFirst.mockResolvedValue({ id: 'available' }); tx.shift.findFirst.mockResolvedValue(null);
    tx.shiftClaim.create.mockResolvedValue({ id: 'claim-1', postingId: 'posting-1', status: ClaimStatus.PENDING });
    await expect(service.claim('claimant', 'posting-1')).resolves.toEqual({ id: 'claim-1', postingId: 'posting-1', status: ClaimStatus.PENDING });
    expect(tx.shiftPosting.update).toHaveBeenCalledWith({ where: { id: 'posting-1' }, data: { status: PostingStatus.PENDING_APPROVAL } });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'SHIFT_CLAIMED' }) });
  });

  it('manager approval transfers assignment, completes posting, notifies, and audits', async () => {
    tx.shiftClaim.findUnique.mockResolvedValue({ id: 'claim-1', claimantId: 'claimant', status: ClaimStatus.PENDING, postingId: 'posting-1', posting: { status: PostingStatus.PENDING_APPROVAL, shiftId: 'shift-1', shift: { assignedUserId: 'owner' } } });
    await service.approve('manager', 'claim-1');
    expect(tx.shift.update).toHaveBeenCalledWith({ where: { id: 'shift-1' }, data: { assignedUserId: 'claimant' } });
    expect(tx.shiftPosting.update).toHaveBeenCalledWith({ where: { id: 'posting-1' }, data: { status: PostingStatus.COMPLETED } });
    expect(tx.notification.createMany).toHaveBeenCalled();
    expect(tx.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'CLAIM_APPROVED' }) });
  });

  it('manager rejection reopens posting, notifies claimant, and audits', async () => {
    tx.shiftClaim.findUnique.mockResolvedValue({ id: 'claim-1', claimantId: 'claimant', status: ClaimStatus.PENDING, postingId: 'posting-1', posting: { status: PostingStatus.PENDING_APPROVAL } });
    await service.reject('manager', 'claim-1');
    expect(tx.shiftPosting.update).toHaveBeenCalledWith({ where: { id: 'posting-1' }, data: { status: PostingStatus.OPEN } });
    expect(tx.notification.create).toHaveBeenCalled();
    expect(tx.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'CLAIM_REJECTED' }) });
  });
});
