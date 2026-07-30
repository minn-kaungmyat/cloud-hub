import { Star } from 'lucide-react';

export interface FavoriteButtonProps {
  isFavorite: boolean;
  onClick: (e: React.MouseEvent) => void;
}

export const FavoriteButton = ({ isFavorite, onClick }: FavoriteButtonProps) => (
  <button
    onClick={onClick}
    className={`w-4 h-4 shrink-0 transition-colors ${
      isFavorite ? 'text-amber-500' : 'text-zinc-600 hover:text-zinc-400'
    }`}
    title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
  >
    <Star size={14} fill={isFavorite ? 'currentColor' : 'none'} />
  </button>
);
