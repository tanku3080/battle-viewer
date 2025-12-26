"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { BattleData } from "@/utils/battle/battle";

export function useBattlePlayback(battle: BattleData | null) {
  const [currentTime, setCurrentTime] = useState(0);
  const [maxTime, setMaxTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [isProductionOpen, setIsProductionOpen] = useState(false);
  const [productionTime, setProductionTime] = useState(0);
  const [isProductionPlaying, setIsProductionPlaying] = useState(false);

  const lastFrameRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const prodLastFrameRef = useRef<number | null>(null);
  const prodRafRef = useRef<number | null>(null);

  // -----------------------------------------------------
  // battle変更時に呼び出す正式な reset関数
  // -----------------------------------------------------
  const resetAfterLoad = useCallback((battle: BattleData | null) => {
    if (!battle) {
      setMaxTime(0);
      setCurrentTime(0);
      setIsPlaying(false);

      setProductionTime(0);
      setIsProductionPlaying(false);
      setIsProductionOpen(false);
      return;
    }

    const timelineTimes: number[] = [];
    battle.units.forEach((u) =>
      u.timeline.forEach((p) => timelineTimes.push(p.t))
    );
    battle.characters?.forEach((c) =>
      c.timeline.forEach((p) => timelineTimes.push(p.t))
    );
    battle.camera?.forEach((c) => timelineTimes.push(c.t));
    battle.events?.forEach((e) => timelineTimes.push(e.t));
    if (battle.meta?.duration !== undefined) {
      timelineTimes.push(battle.meta.duration);
    }

    const max = timelineTimes.length ? Math.max(...timelineTimes) : 0;

    setMaxTime(max);
    setCurrentTime(0);
    setIsPlaying(false);

    setProductionTime(0);
    setIsProductionPlaying(false);
    setIsProductionOpen(false);
  }, []);

  // -----------------------------------------------------
  // battle が変わった時だけ reset関数を呼ぶ
  // -----------------------------------------------------
  useEffect(() => {
    // battle が null でも呼んでOK
    Promise.resolve().then(() => {
      resetAfterLoad(battle);
    });
  }, [battle, resetAfterLoad]);

  // -----------------------------------------------------
  // 再生ループ（開発ビュー）
  // -----------------------------------------------------
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
      return;
    }

    const loop = (ts: number) => {
      if (!lastFrameRef.current) lastFrameRef.current = ts;
      const delta = (ts - lastFrameRef.current) / 1000;
      lastFrameRef.current = ts;

      setCurrentTime((prev) => {
        const t = prev + delta;
        if (t >= maxTime) {
          setIsPlaying(false);
          return maxTime;
        }
        return t;
      });

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, maxTime]);

  // -----------------------------------------------------
  // 再生ループ（本番ビュー）
  // -----------------------------------------------------
  useEffect(() => {
    if (!isProductionPlaying || !isProductionOpen) {
      if (prodRafRef.current !== null) cancelAnimationFrame(prodRafRef.current);
      prodLastFrameRef.current = null;
      return;
    }

    const loop = (ts: number) => {
      if (!prodLastFrameRef.current) prodLastFrameRef.current = ts;
      const delta = (ts - prodLastFrameRef.current) / 1000;
      prodLastFrameRef.current = ts;

      setProductionTime((prev) => {
        const t = prev + delta;
        if (t >= maxTime) {
          setIsProductionPlaying(false);
          setIsProductionOpen(false);
          return maxTime;
        }
        return t;
      });

      prodRafRef.current = requestAnimationFrame(loop);
    };

    prodRafRef.current = requestAnimationFrame(loop);

    return () => {
      if (prodRafRef.current !== null) cancelAnimationFrame(prodRafRef.current);
    };
  }, [isProductionPlaying, isProductionOpen, maxTime]);

  // -----------------------------------------------------
  // 操作API
  // -----------------------------------------------------
  const start = () => {
    if (!battle) return;
    if (currentTime >= maxTime) {
      setCurrentTime(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(true);
    }
  };

  const stop = () => setIsPlaying(false);

  const seek = (t: number) => {
    setCurrentTime(t);
    setIsPlaying(false);
  };

  const startProduction = () => {
    if (!battle) return;
    setProductionTime(0);
    setIsProductionPlaying(true);
    setIsProductionOpen(true);
  };

  const closeProduction = () => {
    setIsProductionPlaying(false);
    setIsProductionOpen(false);
  };

  return {
    currentTime,
    maxTime,
    isPlaying,
    start,
    stop,
    seek,

    productionTime,
    isProductionOpen,
    startProduction,
    closeProduction,

    setCurrentTime,
    setIsPlaying,
    resetAfterLoad, // ← BattlePage から使えるようにした
  };
}
