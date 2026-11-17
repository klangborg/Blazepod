import { PALETTE, type ColorName } from '../domain/colors'
import type { ColorScore } from '../domain/results'

export function PlayerScores({ scores }: { scores: ColorScore[] }) {
  return (
    <div className="player-scores">
      {scores.map((score) => {
        const color = paletteColor(score.color)
        return (
          <div
            key={score.color}
            className="player-card"
            style={
              color
                ? {
                    borderColor: `rgb(${color.r},${color.g},${color.b})`,
                    background: `rgba(${color.r},${color.g},${color.b},0.12)`,
                  }
                : undefined
            }
          >
            <span className="muted">{color?.label ?? score.color}</span>
            <b>{score.hits}</b>
            <span className="muted">Miss {score.misses}</span>
          </div>
        )
      })}
    </div>
  )
}

function paletteColor(value: string) {
  return value in PALETTE ? PALETTE[value as ColorName] : null
}
