import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
async function main() {
  const passwordHash = await bcrypt.hash('demo-password', 10);
  const [employeeA, employeeB] = await Promise.all([
    prisma.user.upsert({ where: { email: 'employee.a@shiftbridge.demo' }, update: {}, create: { name: 'Employee A', email: 'employee.a@shiftbridge.demo', passwordHash, role: Role.EMPLOYEE } }),
    prisma.user.upsert({ where: { email: 'employee.b@shiftbridge.demo' }, update: {}, create: { name: 'Employee B', email: 'employee.b@shiftbridge.demo', passwordHash, role: Role.EMPLOYEE } }),
    prisma.user.upsert({ where: { email: 'manager@shiftbridge.demo' }, update: {}, create: { name: 'Manager', email: 'manager@shiftbridge.demo', passwordHash, role: Role.MANAGER } }),
  ]);
  await prisma.shift.createMany({ skipDuplicates: true, data: [
    { id: 'demo-shift-a', assignedUserId: employeeA.id, startAt: new Date('2026-10-05T09:00:00Z'), endAt: new Date('2026-10-05T17:00:00Z') },
    { id: 'demo-shift-b', assignedUserId: employeeB.id, startAt: new Date('2026-10-06T09:00:00Z'), endAt: new Date('2026-10-06T17:00:00Z') },
    { id: 'demo-conflict-b', assignedUserId: employeeB.id, startAt: new Date('2026-10-07T09:00:00Z'), endAt: new Date('2026-10-07T17:00:00Z') },
  ] });
  await prisma.availability.createMany({ data: [{ userId: employeeB.id, startAt: new Date('2026-10-05T08:00:00Z'), endAt: new Date('2026-10-05T18:00:00Z') }], skipDuplicates: true });
}
main().finally(() => prisma.$disconnect());
