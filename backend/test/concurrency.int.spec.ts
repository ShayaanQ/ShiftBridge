import { ClaimStatus, PostingStatus, PrismaClient, Role } from '@prisma/client';
import { ExchangeService } from '../src/exchange.controller';

const databaseUrl = process.env.DATABASE_URL_TEST;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('PostgreSQL concurrent claims', () => {
  const prisma = databaseUrl
    ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    : new PrismaClient();
  const service = new ExchangeService(prisma as any);
  let postingId: string;
  beforeAll(async () => { await prisma.$connect(); await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditEvent", "Notification", "ShiftClaim", "ShiftPosting", "Availability", "Shift", "User" CASCADE');
    const [owner, claimantA, claimantB] = await Promise.all(['owner', 'claimant-a', 'claimant-b'].map((name) => prisma.user.create({ data: { name, email: `${name}@test.local`, passwordHash: 'x', role: Role.EMPLOYEE } })));
    const startAt = new Date('2030-10-05T09:00:00Z'), endAt = new Date('2030-10-05T17:00:00Z');
    const shift = await prisma.shift.create({ data: { assignedUserId: owner.id, startAt, endAt } });
    const posting = await prisma.shiftPosting.create({ data: { shiftId: shift.id, postedById: owner.id } }); postingId = posting.id;
    await prisma.availability.createMany({ data: [claimantA, claimantB].map((user) => ({ userId: user.id, startAt: new Date('2030-10-05T08:00:00Z'), endAt: new Date('2030-10-05T18:00:00Z') })) });
    (global as any).claimants = [claimantA.id, claimantB.id];
  });
  afterAll(() => prisma.$disconnect());
  it('allows exactly one concurrent claim through the locked posting row', async () => {
    const [a, b] = await Promise.allSettled((global as any).claimants.map((id: string) => service.claim(id, postingId)));
    expect([a, b].filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.shiftClaim.count({ where: { postingId } })).toBe(1);
    expect((await prisma.shiftPosting.findUniqueOrThrow({ where: { id: postingId } })).status).toBe(PostingStatus.PENDING_APPROVAL);
    expect((await prisma.shiftClaim.findFirstOrThrow({ where: { postingId } })).status).toBe(ClaimStatus.PENDING);
  });
});
