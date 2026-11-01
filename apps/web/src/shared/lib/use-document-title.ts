import { useEffect } from "react";

// For titles only known after data loads; static titles belong in the route's head(). Every route
// declares its own head title, so leaving a page resets whatever this wrote.
export const useDocumentTitle = (title: string | undefined) => {
  useEffect(() => {
    if (title) {
      document.title = `${title} · narbel`;
    }
  }, [title]);
};
