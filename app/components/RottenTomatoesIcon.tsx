import type React from 'react';

interface RottenTomatoesIconProps {
  score?: number;
  className?: string;
}

export default function RottenTomatoesIcon({
  score = 100,
  className = 'w-4 h-4',
}: RottenTomatoesIconProps) {
  const isFresh = score >= 60;

  if (!isFresh) {
    // Rotten Tomato: Green Splat
    return (
      <svg
        viewBox="0 0 100 100"
        className={className}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label={`Rotten Tomatoes: ${score}%`}
      >
        <path
          d="M52 14c-5-1-10 2-14 6-4-3-10-4-15-1-6 3-8 10-6 16-3 2-7 6-8 11-2 7 1 15 6 19-3 4-6 9-6 14 0 8 7 14 14 15 4 5 11 8 18 7 7-1 14-6 17-12 5 2 12 1 16-3 4-4 5-11 2-16 4-4 6-10 4-16-2-6-8-10-14-10-1-5-5-10-10-12-4-1-8 0-12 3 1-5-2-10-6-12-2-1-4-1-6-1z"
          fill="#5ea926"
        />
        <circle cx="36" cy="46" r="5" fill="#2d5212" opacity="0.6" />
        <circle cx="56" cy="58" r="6" fill="#2d5212" opacity="0.5" />
        <circle cx="68" cy="40" r="4" fill="#2d5212" opacity="0.5" />
        <path
          d="M48 24c-2 3-5 5-9 6 3 2 7 2 10 1-1-3-1-5-1-7z"
          fill="#3b6e18"
          opacity="0.7"
        />
      </svg>
    );
  }

  // Certified / Fresh Tomato: Red Tomato with Green Leaves
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`Rotten Tomatoes: ${score}%`}
    >
      {/* Red Tomato Body */}
      <path
        d="M50 25C26 25 10 41 10 60c0 19 16 32 40 32s40-13 40-32c0-19-16-35-40-35z"
        fill="#FA320A"
      />
      {/* Tomato Highlight / 3D Sheen */}
      <path
        d="M28 42c-8 9-8 23-4 30 2-8 7-19 14-25 3-3 0-8-10-5z"
        fill="#FF7E62"
        opacity="0.7"
      />
      {/* Green Calyx / Leaves */}
      <path
        d="M50 8c-2 8-8 12-16 11 5 6 12 8 17 6-3 8-10 11-16 10 9 5 19 2 22-5 3 7 13 10 22 5-6 1-13-2-16-10 5 2 12 0 17-6-8 1-14-3-16-11-2 6-5 9-10 8-5 1-8-2-10-8z"
        fill="#00B140"
      />
      <path
        d="M50 16c-1 3-3 5-6 5 2 2 5 3 7 2-1 3-4 4-6 4 4 2 8 1 9-2 1 3 5 4 9 2-2 0-5-1-6-4 2 1 5 0 7-2-3 0-5-2-6-5-1 2-2 3-4 3-2 1-3 0-4-3z"
        fill="#128a38"
      />
    </svg>
  );
}
