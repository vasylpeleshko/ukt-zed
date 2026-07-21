import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from '../src/presentation/guards/api-key.guard';

describe('ApiKeyGuard', () => {
  const createContext = (headers: Record<string, string> = {}) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          header: (name: string) => headers[name.toLowerCase()] ?? headers[name],
        }),
      }),
    }) as never;

  const createReflector = (isPublic = false) =>
    ({
      getAllAndOverride: jest.fn().mockReturnValue(isPublic),
    }) as unknown as Reflector;

  it('allows requests when API_KEY is not configured', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const guard = new ApiKeyGuard(config as never, createReflector());

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows public routes without API key', () => {
    const config = { get: jest.fn().mockReturnValue('secret-key') };
    const guard = new ApiKeyGuard(config as never, createReflector(true));

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows valid x-api-key header', () => {
    const config = { get: jest.fn().mockReturnValue('secret-key') };
    const guard = new ApiKeyGuard(config as never, createReflector());

    expect(
      guard.canActivate(createContext({ 'x-api-key': 'secret-key' })),
    ).toBe(true);
  });

  it('rejects missing or invalid key', () => {
    const config = { get: jest.fn().mockReturnValue('secret-key') };
    const guard = new ApiKeyGuard(config as never, createReflector());

    expect(() => guard.canActivate(createContext())).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      guard.canActivate(createContext({ 'x-api-key': 'wrong' })),
    ).toThrow(UnauthorizedException);
  });
});
