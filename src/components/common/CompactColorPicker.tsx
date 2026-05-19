import React, { useRef } from 'react';
import { Plus } from 'lucide-react';

interface Props {
  value?: string;
  onChange: (color: string) => void;
  className?: string;
  title?: string;
}

/**
 * Compact color picker — a small round "+" button that opens the native browser color picker.
 * Use this when you want a custom color option alongside preset color swatches.
 */
const CompactColorPicker: React.FC<Props> = ({
  value = '#000000',
  onChange,
  className = '',
  title = 'Couleur personnalisée',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label
      className={`h-5 w-5 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600
        flex items-center justify-center cursor-pointer hover:border-gray-500 dark:hover:border-gray-400
        transition-colors flex-shrink-0 ${className}`}
      title={title}
    >
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
      <Plus className="h-2.5 w-2.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
    </label>
  );
};

export default CompactColorPicker;
