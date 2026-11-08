import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { setDeletingAccount } from '../lib/goodbye';
import { Sprite } from '../components/Sprite';
import { Panel } from '../components/ui';

/** Shown after "Delete my account" (0027). Public: the person is signed out by now. */
export default function Goodbye() {
  useEffect(() => setDeletingAccount(false), []);
  return (
    <div className="app-shell" role="main" style={{ paddingTop: 32 }}>
      <div className="stack center">
        <div><Sprite id="yak" size={96} /></div>
        <h1 style={{ margin: 0 }}>Farewell, adventurer</h1>
        <Panel>
          <p>Your account and your YACquest data have been deleted. Thanks for questing with YAC!</p>
          <p style={{ margin: 0 }} className="muted">Changed your mind? You can always start a new quest with a new account.</p>
        </Panel>
        <Link className="btn block" to="/signup">Create a new account</Link>
        <Link className="btn ghost block" to="/privacy">Privacy summary</Link>
      </div>
    </div>
  );
}
