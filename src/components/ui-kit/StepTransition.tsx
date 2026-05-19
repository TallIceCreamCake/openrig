import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/cn';

type StepTransitionProps = {
  stepKey: string | number;
  direction?: 'forward' | 'backward';
  className?: string;
  children: React.ReactNode;
};

const TRANSITION_DURATION_MS = 140;

const StepTransition: React.FC<StepTransitionProps> = ({
  stepKey,
  direction = 'forward',
  className,
  children,
}) => {
  const activeRef = useRef<{ key: string | number; node: React.ReactNode }>({
    key: stepKey,
    node: children,
  });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [leavingChildren, setLeavingChildren] = useState<React.ReactNode | null>(null);

  useEffect(() => {
    if (stepKey !== activeRef.current.key) {
      setLeavingChildren(activeRef.current.node);
      activeRef.current = { key: stepKey, node: children };

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setLeavingChildren(null);
        timeoutRef.current = null;
      }, TRANSITION_DURATION_MS);
      return;
    }

    activeRef.current = { key: stepKey, node: children };
  }, [children, stepKey]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      data-direction={direction}
      className={cn('step-transition-root relative min-h-0', className)}
    >
      {leavingChildren && (
        <div
          aria-hidden="true"
          className="step-transition-layer step-fade-out pointer-events-none absolute inset-0 z-0 min-h-0"
        >
          {leavingChildren}
        </div>
      )}
      <div key={stepKey} className="step-transition-layer step-fade-in relative z-10 h-full min-h-0">
        {children}
      </div>
    </div>
  );
};

export default StepTransition;
