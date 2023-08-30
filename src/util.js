export const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  const formattedHours = String(hours).padStart(2, "0");
  const formattedMins = String(mins).padStart(2, "0");

  return `${formattedHours}:${formattedMins}`;
};

export const fdate = (s) => {
  return new Date(s).toLocaleDateString("en-uk", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};
