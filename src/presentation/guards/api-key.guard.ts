import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const configuredKey = this.config.get<string>('API_KEY');
    if (!configuredKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const headerKey =
      request.header('x-api-key') ??
      request.header('authorization')?.replace(/^Bearer\s+/i, '');

    if (!headerKey || headerKey !== configuredKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}
