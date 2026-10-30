export const fakeClock = () => {
  let time = 1000;
  let task: { at: number; fn: () => void } | null = null;
  return {
    now: () => time,
    setTimeout: (fn: () => void, ms: number) => {
      task = { at: time + ms, fn };
      return task;
    },
    clearTimeout: () => {
      task = null;
    },
    advance(ms: number) {
      time += ms;
      if (task && task.at <= time) {
        const { fn } = task;
        task = null;
        fn();
      }
    },
  };
};
