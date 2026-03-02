'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * useRafThrottledValue 的实现原理（requestAnimationFrame + 时间门限节流）：
 *
 * 1) 目标
 * - 输入 `value` 可能高频变化（例如流式消息、滚动、拖拽等），如果每次变化都触发渲染，UI 压力会很大。
 * - 这个 Hook 返回一个“节流后的值” `throttledValue`，保证更新节奏不超过 `minIntervalMs`（默认 40ms）。
 *
 * 2) 核心状态与引用
 * - `throttledValue`：真正驱动 UI 渲染的值（受节流控制）。
 * - `latestValueRef`：始终记录“最新输入值”，即使还没提交到 state 也不会丢。
 * - `committedValueRef`：记录“最近一次已提交/已显示”的值，用于判断是否仍有积压更新。
 * - `lastCommitRef`：记录最近一次提交时间戳，用来做最小间隔判断。
 * - `frameRef`：当前 RAF 任务 id；非 null 表示循环已在运行，防止重复启动多个循环。
 *
 * 3) 更新流程
 * - 当 `value` 或 `minIntervalMs` 变化时：
 *   - 先把最新值写入 `latestValueRef`。
 *   - 如果 RAF 循环已在运行（`frameRef !== null`），直接返回，避免并发循环。
 *   - 否则启动一个 RAF `tick`。
 * - 在每次 `tick(timestamp)` 中：
 *   - 若 `timestamp - lastCommitRef >= minIntervalMs`，允许提交：
 *     - 更新 `lastCommitRef`。
 *     - 用 `setThrottledValue` 把最新值提交到 state。
 *     - 使用 `Object.is(prev, next)` 做相等性判断，值没变就复用旧值，避免无效渲染。
 *   - 提交后判断 `committedValueRef` 和 `latestValueRef`：
 *     - 不相等：说明还有更新没追上，继续 `requestAnimationFrame(tick)`。
 *     - 相等：说明已追平，停止循环并把 `frameRef` 置空。
 *
 * 4) 为什么要同时有 latest/committed 两个 ref
 * - `latest` 负责“接住所有新输入”；
 * - `committed` 负责“表示 UI 当前已消费到哪里”；
 * - 二者比较能精确知道是否还需要下一帧继续追赶，避免漏更新或空转。
 *
 * 5) 生命周期处理
 * - 组件卸载时取消尚未执行的 RAF，避免卸载后继续调度。
 */
export function useRafThrottledValue<T>(value: T, minIntervalMs = 40): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const latestValueRef = useRef(value);
  const committedValueRef = useRef(value);
  const frameRef = useRef<number | null>(null);
  const lastCommitRef = useRef(0);

  useEffect(() => {
    committedValueRef.current = throttledValue;
  }, [throttledValue]);

  useEffect(() => {
    latestValueRef.current = value;

    if (frameRef.current !== null) return;

    const tick = (timestamp: number) => {
      if (timestamp - lastCommitRef.current >= minIntervalMs) {
        lastCommitRef.current = timestamp;
        setThrottledValue((prev) => {
          const next = latestValueRef.current;
          committedValueRef.current = next;
          return Object.is(prev, next) ? prev : next;
        });
      }

      if (!Object.is(committedValueRef.current, latestValueRef.current)) {
        frameRef.current = window.requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = window.requestAnimationFrame(tick);
  }, [value, minIntervalMs]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);

  return throttledValue;
}
