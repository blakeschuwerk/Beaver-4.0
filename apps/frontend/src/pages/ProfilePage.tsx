import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { GeographyEditor } from '../components/GeographyEditor';
import { isValidUSCounty } from '../lib/usCounties';
import { api } from '../api/client';
import { SERVICE_CATEGORIES } from '../types';
import './ProfilePage.css';

export function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const [company, setCompany] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [geography, setGeography] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setCompany(user.company);
    setCategories([...user.service_categories]);
    setGeography([...user.geography]);
  }, [user]);

  async function persist(updates: {
    company?: string;
    service_categories?: string[];
    geography?: string[];
  }) {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      await api.updateProfile(updates);
      await refreshProfile();
      setStatus('Saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function removeCategory(cat: string) {
    const next = categories.filter((c) => c !== cat);
    setCategories(next);
    persist({ service_categories: next });
  }

  function addCategory(value: string) {
    const trimmed = value.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    const next = [...categories, trimmed];
    setCategories(next);
    setNewCategory('');
    persist({ service_categories: next });
  }

  function removeGeo(geo: string) {
    const next = geography.filter((g) => g !== geo);
    setGeography(next);
    persist({ geography: next });
  }

  function addGeo(label: string) {
    if (!isValidUSCounty(label) || geography.includes(label)) return;
    const next = [...geography, label];
    setGeography(next);
    persist({ geography: next });
  }

  if (!user) return <p className="results-count">Loading…</p>;

  return (
    <div className="profile-page">
      <div className="profile-card">
        <div className="profile-field">
          <label className="profile-label" htmlFor="profile-company">
            Company
          </label>
          <input
            id="profile-company"
            className="profile-input"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            onBlur={() => {
              if (company.trim() && company !== user.company) {
                persist({ company: company.trim() });
              }
            }}
          />
        </div>

        <button
          type="button"
          className="profile-save"
          disabled={saving || company.trim() === user.company}
          onClick={() => persist({ company: company.trim() })}
        >
          {saving ? 'Saving…' : 'Save company'}
        </button>
      </div>

      <div className="profile-card">
        <div className="profile-field">
          <span className="profile-label">Service categories</span>
          <div className="profile-chips">
            {categories.map((cat) => (
              <span key={cat} className="profile-chip profile-chip--accent">
                {cat}
                <button type="button" aria-label={`Remove ${cat}`} onClick={() => removeCategory(cat)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="profile-add-row">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCategory(newCategory);
                }
              }}
              placeholder="Add category…"
              list="profile-category-suggestions"
            />
            <datalist id="profile-category-suggestions">
              {SERVICE_CATEGORIES.filter((c) => !categories.includes(c)).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      <div className="profile-card">
        <GeographyEditor geography={geography} onAdd={addGeo} onRemove={removeGeo} />
      </div>

      {status && <p className="profile-status">{status}</p>}
      {error && <p className="profile-status profile-status--error">{error}</p>}
      <p className="profile-hint">
        In mock mode, changes stay in memory until you restart the API server.
      </p>
    </div>
  );
}
