import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

// Filled line-array silhouette inspired by the provided reference image.
const TraditionalProfileSpotlightIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      {...props}
    >
      <polygon points="4.2,5.4 15.6,3.7 15.7,4.7 4.3,6.4" fill={color} />
      <polygon points="6.7,6.2 15.3,5.5 15.2,8.4 6.7,9" fill={color} />
      <polygon points="6.4,9.5 15.1,8.9 14.7,11.8 6,12.3" fill={color} />
      <polygon points="5.8,12.8 14.5,12.4 13.7,15.2 5.1,15.6" fill={color} />
      <polygon points="5.1,16.1 13.4,15.9 12.1,18.8 4.3,18.6" fill={color} />
    </svg>
  ),
);

TraditionalProfileSpotlightIcon.displayName = 'TraditionalProfileSpotlightIcon';

export default TraditionalProfileSpotlightIcon;
