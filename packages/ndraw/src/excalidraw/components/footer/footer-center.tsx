import clsx from "clsx";
import { useTunnels } from "../../context/tunnels";
import "./footer-center.css";
import { useUIAppState } from "../../context/ui-app-state";

const FooterCenter = ({ children }: { children?: React.ReactNode }) => {
  const { FooterCenterTunnel } = useTunnels();
  const appState = useUIAppState();
  return (
    <FooterCenterTunnel.In>
      <div
        className={clsx("footer-center zen-mode-transition", {
          "layer-ui__wrapper__footer-left--transition-bottom":
            appState.zenModeEnabled,
        })}
      >
        {children}
      </div>
    </FooterCenterTunnel.In>
  );
};

export default FooterCenter;
FooterCenter.displayName = "FooterCenter";
