import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconChevronDown, IconPlus } from './Icons';
import './CountyDropdown.css';

interface CountyDropdownProps {
  counties: string[];
  value: string;
  addedCounties: string[];
  onChange: (county: string) => void;
  onAddCounty: (county: string) => void;
}

export function CountyDropdown({
  counties,
  value,
  addedCounties,
  onChange,
  onAddCounty,
}: CountyDropdownProps) {
  const [open, setOpen] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [input, setInput] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const allCounties = [...new Set([...counties, ...addedCounties])];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAddMode(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function submitCounty() {
    const trimmed = input.trim();
    if (!trimmed) return;
    onAddCounty(trimmed);
    onChange(trimmed);
    setInput('');
    setAddMode(false);
    setOpen(false);
  }

  return (
    <div className="county-drop" ref={ref} data-county-drop>
      <button type="button" className="county-drop__trigger" onClick={() => setOpen(!open)}>
        {value === 'all' ? 'All counties' : value}
        <IconChevronDown size={16} />
      </button>

      {open && (
        <div className="county-drop__panel">
          <button
            type="button"
            className={`county-drop__item${value === 'all' ? ' county-drop__item--active' : ''}`}
            onClick={() => {
              onChange('all');
              setOpen(false);
            }}
          >
            <IconCheck size={14} className={value === 'all' ? '' : 'county-drop__check-hidden'} />
            All counties
          </button>

          <div className="county-drop__divider" />

          <button
            type="button"
            className="county-drop__add"
            onClick={(e) => {
              e.stopPropagation();
              setAddMode(!addMode);
            }}
          >
            <IconPlus size={14} />
            Add county
          </button>

          {addMode && (
            <div className="county-drop__add-form" onClick={(e) => e.stopPropagation()}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitCounty()}
                placeholder="County name"
              />
              <button type="button" onClick={submitCounty}>
                Add
              </button>
            </div>
          )}

          <div className="county-drop__divider" />

          {allCounties.map((county) => (
            <button
              key={county}
              type="button"
              className={`county-drop__item${value === county ? ' county-drop__item--active' : ''}`}
              onClick={() => {
                onChange(county);
                setOpen(false);
              }}
            >
              <IconCheck size={14} className={value === county ? '' : 'county-drop__check-hidden'} />
              {county}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
