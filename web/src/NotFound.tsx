import { Link } from 'react-router-dom';

/**
 * 404 page - visually aligned with the hypr dark editorial theme.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0e0e0e] text-[#f5f5f5]">
      <div className="text-center">
        {/* Large editorial numeral */}
        <h1 className="font-martina-italic text-[8rem] font-light leading-none mb-4">
          404
        </h1>
        {/* Friendly message */}
        <p className="text-[1.125rem] mb-8 tracking-wide">
          Oops! The page you’re looking for doesn’t exist.
        </p>
        {/* Call‑to‑action button back to the home screen */}
        <Link
          to="/"
          className="inline-block px-6 py-2 border border-[#57534E] rounded-[4px] hover:bg-[#1f1f1f] transition-colors"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
