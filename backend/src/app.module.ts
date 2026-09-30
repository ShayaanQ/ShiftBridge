import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { AuthController, AuthService } from './auth.controller';
import { JwtStrategy, RolesGuard } from './auth';
import { ScheduleController, ScheduleService } from './schedule.controller';
import { ExchangeController, ExchangeService, ManagerController } from './exchange.controller';
@Module({ imports: [JwtModule.register({ secret: process.env.JWT_SECRET || 'development-only-change-me', signOptions: { expiresIn: '8h' } })], controllers: [AuthController, ScheduleController, ExchangeController, ManagerController], providers: [PrismaService, AuthService, JwtStrategy, RolesGuard, ScheduleService, ExchangeService] }) export class AppModule {}
