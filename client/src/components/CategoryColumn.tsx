'use client';

import type { Category, ResponseCard } from '@/lib/types';
import ResponseCardView from './ResponseCard';

export default function CategoryColumn({
  title,
  category,
  cards,
  anonymousMode,
  highlighted,
  onToggleHighlight,
  onDropCard,
  onDragStart
}: {
  title: string;
  category: Category;
  cards: ResponseCard[];
  anonymousMode: boolean;
  highlighted: Set<number>;
  onToggleHighlight: (id: number) => void;
  onDropCard: (category: Category) => void;
  onDragStart: (id: number) => void;
}) {
  return (
    <section
      className="column"
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDropCard(category)}
    >
      <div className="column-title">
        <h3>{title}</h3>
        <span>{cards.length}</span>
      </div>
      <div className="column-cards">
        {cards.map((card) => (
          <ResponseCardView
            key={card.id}
            card={card}
            anonymousMode={anonymousMode}
            highlighted={highlighted.has(card.id)}
            onToggleHighlight={() => onToggleHighlight(card.id)}
            draggable
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </section>
  );
}
