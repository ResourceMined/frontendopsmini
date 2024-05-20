export const convertToDarwinTime = (date) => {
  const darwinOffset = 0;
  return new Date(date.getTime() + darwinOffset);
};