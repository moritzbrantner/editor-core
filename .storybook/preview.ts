import type { Preview } from "@storybook/react-vite";
import "../examples/react/src/styles.css";

const preview: Preview = {
  parameters: {
    controls: {
      expanded: true,
    },
  },
};

export default preview;
