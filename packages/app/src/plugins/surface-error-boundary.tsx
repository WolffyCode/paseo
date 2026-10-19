import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";

interface SurfaceErrorBoundaryProps {
  children: ReactNode;
  installation: object;
  resetKey?: unknown;
  Surface: unknown;
  renderError?(error: string): ReactNode;
}

interface SurfaceErrorBoundaryState {
  error: string | null;
}

export class SurfaceErrorBoundary extends Component<
  SurfaceErrorBoundaryProps,
  SurfaceErrorBoundaryState
> {
  state: SurfaceErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): SurfaceErrorBoundaryState {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn("[Plugins] Surface render failed", error, info.componentStack);
  }

  componentDidUpdate(previous: SurfaceErrorBoundaryProps): void {
    if (
      this.state.error &&
      (previous.installation !== this.props.installation ||
        previous.resetKey !== this.props.resetKey ||
        previous.Surface !== this.props.Surface)
    ) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      if (this.props.renderError) return this.props.renderError(this.state.error);
      return <SurfaceErrorText error={this.state.error} />;
    }
    return this.props.children;
  }
}

// A class boundary cannot call hooks, so the translated fallback lives in its own component.
function SurfaceErrorText({ error }: { error: string }) {
  const { t } = useTranslation();
  return <Text style={styles.errorText}>{t("plugins.surfaceFailed", { error })}</Text>;
}

const styles = StyleSheet.create((theme) => ({
  errorText: {
    color: theme.colors.statusDanger,
    padding: theme.spacing[4],
  },
}));
