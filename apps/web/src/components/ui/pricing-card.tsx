"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export interface PricingFeature {
  title: string;
  items: string[];
}

export interface PricingCardProps {
  title: string;
  description: string;
  price: number;
  originalPrice?: number;
  /** Feature groups rendered in the right column */
  features: PricingFeature[];
  buttonText?: string;
  onButtonClick?: () => void;
  /**
   * Suffix after the numeric price, e.g. "%" for performance pricing.
   * Default: empty (renders as `$` + price).
   */
  priceSuffix?: string;
  /**
   * Line under the price (default: "one-time payment").
   * Use for MRR-based or custom billing copy.
   */
  priceSubtitle?: string;
}

export function PricingCard({
  title,
  description,
  price,
  originalPrice,
  features,
  buttonText = "Get Started",
  onButtonClick,
  priceSuffix = "",
  priceSubtitle = "one-time payment",
}: PricingCardProps) {
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.2 });
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (isInView && !hasAnimated) {
      setHasAnimated(true);
    }
  }, [isInView, hasAnimated]);

  const priceDisplay =
    priceSuffix === "%" ? `${price}%` : `$${price}${priceSuffix}`;

  const originalDisplay =
    originalPrice != null
      ? priceSuffix === "%"
        ? `${originalPrice}%`
        : `$${originalPrice}`
      : null;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring" as const,
        stiffness: 260,
        damping: 20,
      },
    },
  };

  const listItemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        type: "spring" as const,
        stiffness: 100,
        damping: 10,
      },
    },
  };

  return (
    <motion.section
      ref={containerRef}
      className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 md:py-24 lg:px-8"
      initial="hidden"
      animate={hasAnimated ? "visible" : "hidden"}
      variants={containerVariants}
    >
      <Card className="relative mx-auto w-full max-w-6xl overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          <motion.div
            className="flex flex-col justify-between p-6 lg:w-2/5 lg:p-10"
            variants={itemVariants}
          >
            <div>
              <CardHeader className="p-0">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-3xl font-bold">{title}</CardTitle>
                    <CardDescription className="mt-2">{description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <motion.div className="mt-6 space-y-4" variants={itemVariants}>
                <div className="flex items-baseline">
                  <span className="text-5xl font-extrabold">{priceDisplay}</span>
                  {originalDisplay && (
                    <span className="ml-2 text-xl text-muted-foreground line-through">
                      {originalDisplay}
                    </span>
                  )}
                </div>
                <span className="block text-sm text-muted-foreground">
                  {priceSubtitle}
                </span>
              </motion.div>
            </div>
            <motion.div className="mt-8" variants={itemVariants}>
              <Button className="w-full text-center leading-tight py-3 h-auto" size="lg" type="button" onClick={onButtonClick}>
                {buttonText}
              </Button>
            </motion.div>
          </motion.div>
          <Separator className="lg:my-6 lg:hidden" />
          <motion.div
            className="bg-muted/50 p-6 lg:w-3/5 lg:p-10"
            variants={itemVariants}
          >
            <div className="space-y-6">
              {features.map((feature, featureIndex) => (
                <div key={feature.title}>
                  <h3 className="mb-4 text-lg font-semibold">{feature.title}:</h3>
                  <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {feature.items.map((item, index) => (
                      <motion.li
                        key={item}
                        className="flex items-center"
                        variants={listItemVariants}
                        custom={index + featureIndex * feature.items.length}
                      >
                        <Check className="mr-2 h-4 w-4 shrink-0 text-primary" />
                        <span className="text-sm">{item}</span>
                      </motion.li>
                    ))}
                  </ul>
                  {featureIndex < features.length - 1 && <Separator className="my-6" />}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </Card>
    </motion.section>
  );
}
