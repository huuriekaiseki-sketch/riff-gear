'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { QUIZ_QUESTIONS } from '@/lib/quiz'

// 「あなたにぴったりの機材診断」の質問フォーム(Issue #80)。
// 3問を1問ずつ表示するステップUI。useEffect内でのsetStateは
// react-hooks/set-state-in-effectでエラーになるため使わず、
// ボタンクリックのイベントハンドラ内だけでstateを更新する。
export default function QuizForm() {
  const router = useRouter()
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<Partial<Record<string, string>>>({})

  const currentQuestion = QUIZ_QUESTIONS[stepIndex]
  const isLastStep = stepIndex === QUIZ_QUESTIONS.length - 1

  function handleSelect(value: string) {
    const nextAnswers = { ...answers, [currentQuestion.key]: value }
    setAnswers(nextAnswers)

    if (isLastStep) {
      // 最終問に回答したら結果ページへ遷移する。全質問のkeyがそろっている前提。
      const params = new URLSearchParams(nextAnswers as Record<string, string>)
      router.push(`/quiz?${params.toString()}`)
      return
    }
    setStepIndex(stepIndex + 1)
  }

  function handleBack() {
    if (stepIndex === 0) return
    setStepIndex(stepIndex - 1)
  }

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-gray-200/60 bg-surface p-6 dark:border-gray-800/60">
      <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
        {stepIndex + 1} / {QUIZ_QUESTIONS.length}
      </p>
      <h1 className="mb-6 text-xl font-semibold text-foreground">{currentQuestion.question}</h1>
      <div className="flex flex-col gap-3">
        {currentQuestion.options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSelect(option.value)}
            className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
              answers[currentQuestion.key] === option.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-gray-300 text-foreground hover:border-primary dark:border-gray-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {stepIndex > 0 && (
        <button
          type="button"
          onClick={handleBack}
          className="mt-6 text-sm text-gray-500 underline transition-colors hover:text-primary dark:text-gray-400"
        >
          ひとつ前の質問に戻る
        </button>
      )}
    </div>
  )
}

