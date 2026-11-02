import {motion} from "framer-motion";
import {EASE_OUT} from "./motion";

// Top-of-screen toast. Render inside an AnimatePresence so it animates out.
export default function Toast({message, type}: {message: string; type: string}) {
  return (
      <motion.div className="toast-wrap" role="status" aria-live="polite"
                  initial={{opacity: 0, y: "-100%"}} animate={{opacity: 1, y: 0}}
                  exit={{opacity: 0, y: "-100%"}}
                  transition={{duration: 0.25, ease: EASE_OUT}}>
        <div className={`toast ${type}`}>
          <span className="toast-dot" aria-hidden="true"/>
          {message}
        </div>
      </motion.div>
  );
}
