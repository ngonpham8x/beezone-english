import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useContext, type ElementType } from 'react';
import { DialogPortalContext } from './DialogFrame';

interface ResponsiveSelectProps {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  icon?: ElementType;
  className?: string;
}

// Keep filter values in their owning module. Radix handles focus, keyboard
// selection and popup collisions; CSS bounds and wraps the option labels.
export function ResponsiveSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder = 'Chọn mục',
  icon: Icon,
  className = '',
}: ResponsiveSelectProps) {
  const portalContainer = useContext(DialogPortalContext);
  const selectedLabel = options.find((option) => option.value === value)?.label || placeholder;
  return (
    <div className={`responsive-select ${className}`}>
      <Select.Root
        value={value}
        onValueChange={onChange}
        disabled={disabled || options.length === 0}
      >
        <Select.Trigger
          aria-label={label}
          title={selectedLabel}
          className="filter-control select-menu-trigger"
          data-has-icon={Boolean(Icon)}
        >
          {Icon && <Icon aria-hidden="true" className="select-menu-leading" />}
          <span className="select-menu-label">
            <Select.Value placeholder={placeholder}>{selectedLabel}</Select.Value>
          </span>
          <Select.Icon asChild>
            <ChevronDown aria-hidden="true" className="select-menu-arrow" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal container={portalContainer}>
          <Select.Content
            aria-label={label}
            position="popper"
            align="end"
            sideOffset={6}
            collisionPadding={8}
            avoidCollisions
            hideWhenDetached
            className="select-menu-content"
          >
            <Select.ScrollUpButton className="select-menu-scroll">
              <ChevronUp aria-hidden="true" size={16} />
            </Select.ScrollUpButton>
            <Select.Viewport className="select-menu-viewport">
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value} className="select-menu-option">
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="select-menu-indicator">
                    <Check aria-hidden="true" size={16} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="select-menu-scroll">
              <ChevronDown aria-hidden="true" size={16} />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
