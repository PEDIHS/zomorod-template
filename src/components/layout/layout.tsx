import type { ReactNode } from "react";
import { Footer } from "./footer";

interface LayoutProps {
    children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
    return (
        <div className="relative flex min-h-[100svh] flex-col bg-background">
            <div className="flex-1">
                {children}
            </div>
            <Footer />
        </div>
    );
}
