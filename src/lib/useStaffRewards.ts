/**
 * The signed-in person's STAFF-ONLY rewards (0020). Participants never call the API at all and
 * always get null, so nothing staff-only can render for them.
 */
import * as api from '../api';
import { useAuth } from './auth';
import { useAsync } from './useAsync';

export const isStaffRole = (role?: string) => role === 'admin' || role === 'chair';

export function useStaffRewards() {
  const { user } = useAuth();
  const staff = isStaffRole(user?.role);
  return useAsync(() => (staff ? api.myStaffRewards() : Promise.resolve(null)), [user?.id, staff], { live: true });
}
