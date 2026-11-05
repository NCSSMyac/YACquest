import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../api/mock';
import { NAME_NOT_ALLOWED, nameIsClean } from '../lib/nameFilter';
import { describeAction } from '../lib/actionText';

const { load, setSession } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);
const userBy = (handle: string) => load().users.find((u) => u.handle === handle)!;

beforeEach(async () => {
  await api.resetDemoData();
});

describe('nameIsClean', () => {
  it.each(['Jade G.', 'Cassie', 'Classy Cat', 'Dickens', 'Peacock', 'Sam K'])('allows %s', (n) => {
    expect(nameIsClean(n)).toBe(true);
  });
  it.each(['f.u.c.k', 'Sh1t', 'big ass', 'ASS', 'b1tch', 'xXslutXx'])('blocks %s', (n) => {
    expect(nameIsClean(n)).toBe(false);
  });
});

describe('mock name rules', () => {
  const base = { email: 'new@gmail.com', password: 'password1', campus: 'duke' as const, avatar: 'yak' as const, acceptedRules: true };

  it('signup rejects an unclean username or display name', async () => {
    setSession(null);
    await expect(api.signup({ ...base, handle: 'sh1t_lord', displayName: 'Nice Name' })).rejects.toMatchObject({ code: 'handle', message: NAME_NOT_ALLOWED });
    await expect(api.signup({ ...base, handle: 'nice_one', displayName: 'big ass' })).rejects.toMatchObject({ code: 'displayName', message: NAME_NOT_ALLOWED });
    await expect(api.signup({ ...base, handle: 'classy_cat', displayName: 'Classy Cat' })).resolves.toMatchObject({ user: { displayName: 'Classy Cat' } });
  });

  it('updateProfile rejects an unclean display name', async () => {
    asUser('yak001');
    await expect(api.updateProfile({ displayName: 'b1tch' })).rejects.toMatchObject({ code: 'displayName', message: NAME_NOT_ALLOWED });
    expect(userBy('yak001').displayName).toBe('Yak001');
  });
});

describe('adminRenameUser', () => {
  it('is admin/chair only', async () => {
    asUser('yak001');
    const other = load().users.find((u) => u.role === 'participant' && u.handle !== 'yak001')!;
    await expect(api.adminRenameUser(other.id, 'Fixed Name')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('validates the new name', async () => {
    asUser('admin');
    const id = userBy('yak001').id;
    await expect(api.adminRenameUser(id, 'x')).rejects.toMatchObject({ code: 'displayName' });
    await expect(api.adminRenameUser(id, 'xXslutXx')).rejects.toMatchObject({ code: 'displayName', message: NAME_NOT_ALLOWED });
    await expect(api.adminRenameUser('usr_nope', 'Fine Name')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('renames, notifies the player and logs the change', async () => {
    asUser('iesha');
    const u = userBy('yak001');
    await api.adminRenameUser(u.id, '  Sam K  ');
    expect(userBy('yak001').displayName).toBe('Sam K');
    const n = load().notifications.find((x) => x.userId === u.id);
    expect(n?.title).toBe('Your display name was updated');
    const log = load().actions[load().actions.length - 1];
    expect(log).toMatchObject({ action: 'user_renamed', actorName: 'Iesha L.', targetName: 'Sam K', details: { from: 'Yak001', to: 'Sam K' } });
    expect(describeAction(log)).toBe('Iesha L. renamed Yak001 to Sam K');
  });
});
