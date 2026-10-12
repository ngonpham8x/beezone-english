import { UserAccount, UserRole } from '../types';

export interface ActiveSession {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: UserRole;
  loginTime: string;
  lastActive: number;
}

const STORAGE_KEY = 'BEEZONE_ACTIVE_SESSIONS';

export function getActiveSessions(): ActiveSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    
    // Filter valid sessions with valid email/id, active within 48h
    const now = Date.now();
    return list.filter((s): s is ActiveSession => {
      return Boolean(
        s &&
        typeof s === 'object' &&
        (s.email || s.name) &&
        s.role &&
        (!s.lastActive || now - s.lastActive < 48 * 60 * 60 * 1000)
      );
    });
  } catch {
    return [];
  }
}

export function registerActiveSession(user: UserAccount): void {
  if (!user || (!user.email && !user.name)) return;
  try {
    const current = getActiveSessions();
    const cleanEmail = (user.email || '').trim().toLowerCase();
    const cleanName = (user.name || '').trim() || (cleanEmail ? cleanEmail.split('@')[0] : 'Người dùng BeeZone');

    const updatedSession: ActiveSession = {
      id: user.id || `user_${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      avatar: user.avatar || '',
      role: user.role || 'staff',
      loginTime: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      lastActive: Date.now(),
    };

    const existingIndex = current.findIndex(
      (s) => (cleanEmail && s.email.toLowerCase() === cleanEmail) || s.id === user.id
    );

    if (existingIndex >= 0) {
      current[existingIndex] = {
        ...current[existingIndex],
        ...updatedSession,
      };
    } else {
      current.push(updatedSession);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Failed to register active session:', e);
  }
}

export function removeActiveSession(emailOrId: string): void {
  try {
    const current = getActiveSessions();
    const target = emailOrId.trim().toLowerCase();
    const filtered = current.filter(
      (s) => s.id !== emailOrId && s.email.toLowerCase() !== target
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to remove active session:', e);
  }
}

export function clearActiveSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

