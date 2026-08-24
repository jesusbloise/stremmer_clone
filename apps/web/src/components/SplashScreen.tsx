"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function SplashScreen() {
  const [show, setShow] = useState(true);
  const duration = 3000; // 3 segundos total
  const router = useRouter();

useEffect(() => {
  const loadingAudio = new Audio("/sounds/carga.mp3");
  loadingAudio.volume = 0.5;
  loadingAudio.play().catch(() => {});

  const timer = setTimeout(() => {
    setShow(false);
    const exitAudio = new Audio("/sounds/exit.mp3");
    exitAudio.volume = 0.7;
    exitAudio.play().catch(() => {});
  }, duration);

  return () => clearTimeout(timer);
}, []);

  return (
    <AnimatePresence
      mode="wait"
      onExitComplete={() => {
        // 👉 cuando termina todo, redirige
        router.replace("/organizar");
      }}
    >
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="fixed inset-0 flex flex-col items-center justify-center bg-black z-[9999]"
        >
          {/* Logo que explota al final */}
          <motion.div
            initial={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
            animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
            exit={{ scale: 2, opacity: 0, filter: "blur(12px)" }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
          >
            <Image
              src="/Logo_Stock_Library@2x.png"
              alt="ATOMICA"
              width={220}
              height={220}
              priority
              className="drop-shadow-[0_0_25px_rgba(255,255,255,0.3)]"
            />
          </motion.div>

          {/* Texto */}
          <motion.h1
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 1.2, delay: 0.6 }}
            className="mt-6 text-4xl md:text-6xl font-bold text-white text-center tracking-wide"
          >
            Bienvenido a la{" "}
            <span className="text-orange-400 drop-shadow-[0_0_15px_rgba(255,140,0,0.7)]">
              App de Atomica
            </span>
          </motion.h1>

          {/* Barra de carga */}
          <div className="w-64 h-2 bg-zinc-800 rounded-full overflow-hidden mt-10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: duration / 1000, ease: "linear" }}
              className="h-full bg-gradient-to-r from-orange-400 to-yellow-300"
            />
          </div>

          <p className="mt-3 text-sm text-zinc-400 font-medium tracking-wide">
            Cargando...
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}