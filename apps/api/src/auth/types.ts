import type { Request } from 'express';

export type Permission = { resource: string; action: string; scope: 'ALL' | 'TEAM' | 'OWN' };

export type AuthContext = {
  type: 'session' | 'apiKey';
  organizationId: string;
  userId?: string;
  teamId?: string | null;
  roleKey?: string;
  name: string;
  email?: string;
  messageSignatureEnabled?: boolean;
  permissions: Permission[];
  apiScopes?: string[];
};

export type AuthenticatedRequest = Request & { auth: AuthContext };
