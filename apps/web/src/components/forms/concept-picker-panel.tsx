"use client";



import { Sparkles, Loader2, CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";

import { cn } from "@/lib/utils";

import type { AgentConcept } from "@/lib/agent-types";



type Props = {

  concepts: AgentConcept[];

  selectedTitle: string | null;

  renderingTitle?: string | null;

  onSelectAndRender: (title: string) => void;

  onDiscover: () => void;

  discovering?: boolean;

  loading?: boolean;

};



export function ConceptPickerPanel({

  concepts,

  selectedTitle,

  renderingTitle,

  onSelectAndRender,

  onDiscover,

  discovering,

  loading,

}: Props) {

  if (!concepts.length) {

    return (

      <Card className="border-primary/20 bg-card/80">

        <CardHeader>

          <CardTitle className="flex items-center gap-2 text-lg">

            <Sparkles className="h-5 w-5 text-primary" />

            Подбор концепций

          </CardTitle>

        </CardHeader>

        <CardContent className="space-y-4">

            <p className="text-sm text-muted-foreground leading-relaxed">

            AI предложит 5 визуальных концепций по вашему брифу. Выберите вариант —

            укажите название проекта и запустите визуализацию.

          </p>

          <Button onClick={onDiscover} disabled={discovering || loading} className="gap-2">

            {discovering ? (

              <>

                <Loader2 className="h-4 w-4 animate-spin" />

                Подбираем концепции…

              </>

            ) : (

              <>

                <Sparkles className="h-4 w-4" />

                Подобрать концепции

              </>

            )}

          </Button>

        </CardContent>

      </Card>

    );

  }



  return (

    <Card className="border-primary/20 bg-card/80">

      <CardHeader>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-lg break-words">Выберите концепцию для фото</CardTitle>
            <p className="mt-1 break-words text-sm text-muted-foreground">

              {concepts.length} вариантов — выбор откроет подтверждение и сохранит проект

            </p>

          </div>

          <Button

            variant="ghost"

            size="sm"

            onClick={onDiscover}

            disabled={discovering || Boolean(renderingTitle)}

            className="text-xs shrink-0"

          >

            Заново

          </Button>

        </div>

      </CardHeader>

      <CardContent className="grid gap-3 sm:grid-cols-2">

        {concepts.map((c) => {

          const selected = selectedTitle === c.title;

          const rendering = renderingTitle === c.title;

          const disabled = Boolean(renderingTitle) && !rendering;



          return (

            <button

              key={c.title}

              type="button"

              disabled={disabled}

              onClick={() => onSelectAndRender(c.title)}

              className={cn(

                "rounded-xl border p-4 text-left transition-all",

                selected

                  ? "border-primary bg-primary/10 shadow-glow-sm"

                  : "border-border/60 hover:border-primary/40 hover:bg-secondary/30",

                disabled && "opacity-50 cursor-not-allowed",

                rendering && "ring-2 ring-primary/50",

              )}

            >

              <div className="flex items-start justify-between gap-2">

                <span className="font-semibold text-sm leading-snug">{c.title}</span>

                {rendering ? (

                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />

                ) : selected ? (

                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />

                ) : null}

              </div>

              {c.score != null && (

                <Badge variant="secondary" className="mt-2 text-[10px]">

                  Score {c.score}

                </Badge>

              )}

              <p className="mt-2 text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap">

                {c.narrative || c.description}

              </p>

              {rendering && (

                <p className="mt-2 text-xs text-primary font-medium">

                  Собираем финальную сцену…

                </p>

              )}

            </button>

          );

        })}

      </CardContent>

    </Card>

  );

}


