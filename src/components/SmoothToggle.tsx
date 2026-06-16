interface SmoothToggleProps {
  enabled: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  className?: string;
}

export const SmoothToggle = ({
  enabled,
  onChange,
  label,
  className = '',
}: SmoothToggleProps) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <button
        onClick={() => onChange(!enabled)}
        className={`
          toggle-animated
          relative inline-flex h-8 w-14 items-center rounded-full
          transition-all duration-300
          ${enabled ? 'bg-primary' : 'bg-muted'}
        `}
      >
        <span
          className={`
            inline-block h-6 w-6 transform rounded-full
            bg-white transition-transform duration-300
            ${enabled ? 'translate-x-7' : 'translate-x-1'}
          `}
        />
      </button>
      {label && <span className="text-sm font-medium">{label}</span>}
    </div>
  );
};

export default SmoothToggle;
