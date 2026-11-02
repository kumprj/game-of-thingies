import React from "react";
import {motion} from "framer-motion";
import {EASE_IN_OUT} from "./motion";

// Expand/collapse wrapper shared by the scoreboard and how-to-play sections.
export default function Collapse({children}: {children: React.ReactNode}) {
  return (
      <motion.div style={{overflow: "hidden"}}
                  initial={{height: 0, opacity: 0}} animate={{height: "auto", opacity: 1}}
                  exit={{height: 0, opacity: 0}}
                  transition={{duration: 0.22, ease: EASE_IN_OUT}}>
        {children}
      </motion.div>
  );
}
