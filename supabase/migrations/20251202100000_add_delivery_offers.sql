CREATE TABLE IF NOT EXISTS "public"."delivery_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "pricing_type" "text" NOT NULL,
    "rate_amount" numeric DEFAULT 0 NOT NULL,
    "base_amount" numeric DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "delivery_offers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_offers_pricing_type_check" CHECK (("pricing_type" = ANY (ARRAY['per_km'::"text", 'per_hour'::"text", 'fixed'::"text", 'per_day'::"text", 'per_trip'::"text"])))
);

ALTER TABLE "public"."delivery_offers" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "delivery_offers_active_idx" ON "public"."delivery_offers" USING "btree" ("is_active");
