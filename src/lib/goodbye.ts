/**
 * Set while "Delete my account" runs, so the sign-out that follows lands on #/goodbye instead of #/login
 * (the auth listener can drop the user before the Me screen gets to navigate).
 */
let deleting = false;
export const setDeletingAccount = (on: boolean) => {
  deleting = on;
};
export const isDeletingAccount = () => deleting;
