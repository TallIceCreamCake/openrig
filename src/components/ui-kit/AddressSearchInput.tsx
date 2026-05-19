import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import Input from '../ui/Input';

type AddressOption = {
  label: string;
  value: string;
};

type AddressSearchInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  loadingLabel?: string;
  disabled?: boolean;
  minChars?: number;
  className?: string;
};

const AddressSearchInput: React.FC<AddressSearchInputProps> = ({
  id,
  value,
  onChange,
  onSelect,
  placeholder = 'Adresse',
  emptyLabel = 'Aucune adresse trouvée.',
  loadingLabel = 'Chargement...',
  disabled = false,
  minChars = 3,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AddressOption[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Position the portal dropdown right below the input — runs synchronously before paint
  useLayoutEffect(() => {
    if (!open || !containerRef.current || !dropdownRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const el = dropdownRef.current;
    el.style.position = 'fixed';
    el.style.top = `${rect.bottom + 6}px`;
    el.style.left = `${rect.left}px`;
    el.style.width = `${rect.width}px`;
    el.style.zIndex = '9999';
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideContainer = containerRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideContainer && !insideDropdown) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Fetch suggestions
  useEffect(() => {
    if (!open || disabled) return;
    if (query.trim().length < minChars) { setResults([]); setLoading(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=fr`,
          { signal: controller.signal, headers: { 'Accept': 'application/json' } }
        );
        const data = await res.json();
        const features = Array.isArray(data?.features) ? data.features : [];
        setResults(features.map((f: any) => {
          const p = f?.properties ?? {};
          const parts = [p.name, p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street, p.postcode && p.city ? `${p.postcode} ${p.city}` : p.city, p.country].filter(Boolean);
          const label = parts.join(', ');
          return { label, value: label };
        }).filter((o: AddressOption) => o.label));
      } catch (err) {
        if ((err as any)?.name !== 'AbortError') setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open, disabled, minChars]);

  const showDropdown = open && (loading || results.length > 0 || query.trim().length >= minChars);

  const handleSelect = (option: AddressOption) => {
    onChange(option.value);
    onSelect?.(option.value);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setQuery(next);
    onChange(next);
    if (!open) setOpen(true);
  };

  const emptyState = useMemo(() => (
    <div className="px-3 py-2 text-sm text-slate-500">{emptyLabel}</div>
  ), [emptyLabel]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Input
        id={id}
        value={query}
        onChange={handleInputChange}
        onFocus={() => !disabled && setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{ display: showDropdown ? 'block' : 'none' }}
          className="rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="max-h-56 overflow-auto py-1">
            {loading && <div className="px-3 py-2 text-sm text-slate-500">{loadingLabel}</div>}
            {!loading && results.length === 0 && query.trim().length >= minChars && emptyState}
            {!loading && results.map((option, i) => (
              <button
                key={`${i}-${option.value}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(option)}
                className="flex w-full items-start px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AddressSearchInput;
