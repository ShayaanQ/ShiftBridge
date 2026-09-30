import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ScheduleService } from './schedule.controller';

describe('ScheduleService (Phase 1)', () => {
  const employee = { id: 'employee-a', email: 'employee.a@shiftbridge.demo', role: Role.EMPLOYEE };
  let prisma: any;
  let service: ScheduleService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(employee) },
      shift: { createMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn() },
      availability: { create: jest.fn(), findMany: jest.fn() },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (work) => work({ shift: prisma.shift, auditEvent: prisma.auditEvent })),
    };
    service = new ScheduleService(prisma);
  });

  it('manager imports a valid CSV and records one audit event', async () => {
    await expect(service.importCsv('manager-1', 'employee.a@shiftbridge.demo,2026-10-05T09:00:00Z,2026-10-05T17:00:00Z')).resolves.toEqual({ created: 1 });
    expect(prisma.shift.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ assignedUserId: employee.id })] }));
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: 'manager-1', action: 'SCHEDULE_IMPORTED' }) });
  });

  it('rejects imports with an unknown employee', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.importCsv('manager-1', 'nope@example.com,2026-10-05T09:00:00Z,2026-10-05T17:00:00Z')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates an availability window only when the range is valid', async () => {
    prisma.availability.create.mockResolvedValue({ id: 'window-1' });
    await expect(service.addAvailability(employee.id, { startAt: '2026-10-05T08:00:00Z', endAt: '2026-10-05T18:00:00Z' })).resolves.toEqual({ id: 'window-1' });
    await expect(service.addAvailability(employee.id, { startAt: '2026-10-05T18:00:00Z', endAt: '2026-10-05T08:00:00Z' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
