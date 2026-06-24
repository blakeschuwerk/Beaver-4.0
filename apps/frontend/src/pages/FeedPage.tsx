import { useMemo, useState, useEffect } from 'react';
import { CountyDropdown } from '../components/CountyDropdown';
import { ProjectCard } from '../components/ProjectCard';
import { IconSearch } from '../components/Icons';
import { useProjects, useTrackedIds } from '../hooks/useProjects';
import { STAGE_FILTERS } from '../types';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isValidUSCounty } from '../lib/usCounties';

export function FeedPage() {
  const { user, refreshProfile } = useAuth();
  const [stage, setStage] = useState('all');
  const [county, setCounty] = useState('all');
  const [tag, setTag] = useState('all');
  const [minMatch, setMinMatch] = useState(0);
  const [query, setQuery] = useState('');
  const [counties, setCounties] = useState<string[]>([]);
  const [addedCounties, setAddedCounties] = useState<string[]>([]);
  const { trackedIds, toggleTrack } = useTrackedIds();

  const filters = useMemo(
    () => ({ stage, county, tag, minMatch, query }),
    [stage, county, tag, minMatch, query],
  );
  const { projects, loading } = useProjects(filters);

  useEffect(() => {
    api.getCounties().then(({ counties: data }) => {
      setCounties(data.map((c) => c.name));
    });
  }, []);

  useEffect(() => {
    if (!user?.geography?.length) return;
    const canonical = user.geography.filter(isValidUSCounty);
    setAddedCounties((prev) => [...new Set([...prev, ...canonical])]);
  }, [user?.geography]);

  function handleAddCounty(label: string) {
    if (!isValidUSCounty(label)) return;
    setAddedCounties((prev) => [...new Set([...prev, label])]);
    const nextGeo = [...new Set([...(user?.geography ?? []), label])];
    api
      .updateProfile({ geography: nextGeo })
      .then(() => refreshProfile())
      .catch(console.error);
  }

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    projects.forEach((p) => p.tags.forEach((t) => tags.add(t)));
    return ['all', ...Array.from(tags)];
  }, [projects]);

  return (
    <div>
      <div className="filter-bar">
        <div className="filter-bar__row">
          <div className="filter-bar__search-wrap">
            <IconSearch size={16} />
            <input
              className="filter-bar__search"
              placeholder="Search projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <CountyDropdown
            counties={counties}
            value={county}
            addedCounties={addedCounties}
            onChange={setCounty}
            onAddCounty={handleAddCounty}
          />
          <select
            className="filter-bar__select"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All trades' : t}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-bar__row">
          <div className="stage-chips">
            {STAGE_FILTERS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`stage-chip${stage === s.key ? ' stage-chip--active' : ''}`}
                onClick={() => setStage(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="filter-bar__slider-wrap">
            Min match
            <input
              type="range"
              className="filter-bar__slider"
              min={0}
              max={95}
              step={5}
              value={minMatch}
              onChange={(e) => setMinMatch(Number(e.target.value))}
            />
            <span className="filter-bar__slider-value">
              {minMatch > 0 ? `${minMatch}%` : '0%'}
            </span>
          </div>
        </div>
      </div>

      <p className="results-count">
        {loading ? 'Loading…' : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
      </p>

      {projects.length === 0 && !loading ? (
        <div className="empty-state">
          <h3>No projects match your filters</h3>
          <p>Try adjusting filters or check back after the next pipeline run.</p>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              tracked={trackedIds.has(p.id)}
              onToggleTrack={toggleTrack}
              detailed
            />
          ))}
        </div>
      )}
    </div>
  );
}
