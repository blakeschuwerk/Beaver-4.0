import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { GeographyEditor } from '../components/GeographyEditor';
import { SERVICE_CATEGORIES } from '../types';
import './AuthPage.css';

const DEFAULT_GEOS = ['Nash County, NC'];

export function AuthPage() {
  const { signUp, signIn } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [categories, setCategories] = useState<string[]>(['Roadway', 'Drainage']);
  const [geography, setGeography] = useState<string[]>(DEFAULT_GEOS);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function addGeo(label: string) {
    setGeography((prev) => (prev.includes(label) ? prev : [...prev, label]));
  }

  function removeGeo(label: string) {
    setGeography((prev) => prev.filter((g) => g !== label));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp({ email, password, company, service_categories: categories, geography });
      } else {
        await signIn(email, password);
      }
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-page__left">
        <div className="auth-page__logo">
          <div className="auth-page__mark">
            <span /><span />
          </div>
          <span>Beaver</span>
        </div>
        <div className="auth-page__hero">
          <h1>Public infrastructure leads, matched to your trade.</h1>
          <ul>
            <li>Matched opportunities from county and state agencies</li>
            <li>Early-stage projects before public bids</li>
            <li>Stage-change alerts on projects you track</li>
          </ul>
        </div>
        <div className="auth-page__footer">Beaver 4.0 · v0.1</div>
      </div>

      <div className="auth-page__right">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h2>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>

          <button type="button" className="auth-card__sso" disabled>
            Continue with Google
          </button>

          <div className="auth-card__divider"><span>or</span></div>

          {mode === 'signup' && (
            <>
              <label>
                Company name
                <input value={company} onChange={(e) => setCompany(e.target.value)} required />
              </label>
            </>
          )}

          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>

          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>

          {mode === 'signup' && (
            <>
              <div className="auth-card__field">
                <span className="auth-card__label">Service categories</span>
                <div className="auth-card__chips">
                  {SERVICE_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`auth-chip${categories.includes(cat) ? ' auth-chip--active' : ''}`}
                      onClick={() => toggleCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="auth-card__field auth-card__field--geography">
                <GeographyEditor geography={geography} onAdd={addGeo} onRemove={removeGeo} />
              </div>
            </>
          )}

          {error && <p className="auth-card__error">{error}</p>}

          <button type="submit" className="auth-card__submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>

          <p className="auth-card__switch">
            {mode === 'signup' ? 'Already have an account?' : 'New to Beaver?'}{' '}
            <button type="button" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
              {mode === 'signup' ? 'Sign in' : 'Create account'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
