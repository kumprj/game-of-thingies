import React from 'react';
import { motion } from "framer-motion";
import { Entry } from '../../../../types';

interface Props {
  entry: Entry;
  isMyTurn: boolean;
  isMyCard: boolean;
  isLastEntry: boolean;
  isShaking: boolean;
  onClick: (entry: Entry) => void;
}

export const EntryButton: React.FC<Props> = ({
                                               entry, isMyTurn, isMyCard, isLastEntry, isShaking, onClick
                                             }) => {
  const isDisabled =
      !isMyTurn ||
      entry.guessed ||
      (isMyCard && !isLastEntry);

  return (
      <motion.div
          animate={isShaking ? { x: [0, -10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="mb-3"
      >
        <button
            disabled={isDisabled}
            onClick={() => onClick(entry)}
            className={`w-full text-left p-4 rounded-lg shadow-sm border transition-all ${
                isDisabled
                    ? "opacity-50 cursor-not-allowed bg-gray-50 border-gray-200"
                    : "bg-white border-blue-100 hover:border-blue-300 hover:shadow-md active:scale-[0.99]"
            }`}
        >
          <span className="text-lg text-gray-800">{entry.text}</span>
          {entry.guessed && (
              <span className="block text-sm text-green-600 font-medium mt-1">
             ✓ Written by {entry.authorName}
           </span>
          )}
        </button>
      </motion.div>
  );
};
