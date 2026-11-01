import { createCn } from "cn/config";

// The type ramp's own sizes (globals.css @theme --text-*), so merging them with a text colour keeps both.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "closing",
            "title",
            "headline",
            "feature",
            "label",
            "dense",
          ],
        },
      ],
    },
  },
});
