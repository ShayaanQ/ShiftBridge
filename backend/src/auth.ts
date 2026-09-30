import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Reflector } from '@nestjs/core';
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
@Injectable() export class JwtStrategy extends PassportStrategy(Strategy) { constructor() { super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: process.env.JWT_SECRET || 'development-only-change-me' }); } async validate(payload: { sub: string; email: string; role: Role }) { return { id: payload.sub, email: payload.email, role: payload.role }; } }
@Injectable() export class JwtAuthGuard implements CanActivate { constructor(private jwt: JwtService) {} canActivate(context: ExecutionContext) { const req = context.switchToHttp().getRequest(); const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req); if (!token) throw new UnauthorizedException(); try { req.user = this.jwt.verify(token); return true; } catch { throw new UnauthorizedException(); } } }
@Injectable() export class RolesGuard implements CanActivate { constructor(private reflector: Reflector) {} canActivate(context: ExecutionContext) { const roles = this.reflector.getAllAndOverride<Role[]>('roles', [context.getHandler(), context.getClass()]); return !roles || roles.includes(context.switchToHttp().getRequest().user.role); } }
