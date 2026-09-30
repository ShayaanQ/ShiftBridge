import { Body, Controller, Injectable, Post, UnauthorizedException } from '@nestjs/common';
import { IsEmail, IsString } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
class LoginDto { @IsEmail() email!: string; @IsString() password!: string; }
@Injectable() export class AuthService { constructor(private prisma: PrismaService, private jwt: JwtService) {} async login(dto: LoginDto) { const user = await this.prisma.user.findUnique({ where: { email: dto.email } }); if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Invalid credentials'); return { accessToken: this.jwt.sign({ sub: user.id, email: user.email, role: user.role }), user: { id: user.id, name: user.name, email: user.email, role: user.role } }; } }
@Controller('auth') export class AuthController { constructor(private auth: AuthService) {} @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto); } }
