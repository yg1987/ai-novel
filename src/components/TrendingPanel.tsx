import { useState } from 'react'
import { getTrendingByGenre, getAllGenres, getTopTrending, type TrendingCategory } from '../services/trendingService'
import './TrendingPanel.css'

export default function TrendingPanel() {
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const genres = getAllGenres()
  const data: TrendingCategory[] = selectedGenre
    ? getTrendingByGenre(selectedGenre)
    : [{ genre: '综合热门', tags: getTopTrending(25) }]

  const popularityColor = (p: number): string => {
    if (p >= 90) return '#e74c3c'
    if (p >= 80) return '#e67e22'
    if (p >= 70) return '#f39c12'
    return '#95a5a6'
  }

  return (
    <div className="panel-layout trending-panel">
      <div className="panel-sidebar trending-sidebar">
        <h3>热门题材</h3>
        <p className="trending-subtitle">按小说类型浏览</p>
        <div className="trending-genre-list">
          <button
            className={`trending-genre-btn${selectedGenre === null ? ' active' : ''}`}
            onClick={() => setSelectedGenre(null)}
          >
            综合热门
          </button>
          {genres.map((g) => (
            <button
              key={g}
              className={`trending-genre-btn${selectedGenre === g ? ' active' : ''}`}
              onClick={() => setSelectedGenre(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-editor trending-content">
        {data.map((cat) => (
          <div key={cat.genre} className="trending-section">
            <h3>{cat.genre}</h3>
            <div className="trending-tag-list">
              {cat.tags.map((tag) => (
                <div key={tag.name} className="trending-tag-card">
                  <div className="trending-tag-header">
                    <span className="trending-tag-name">{tag.name}</span>
                    <span
                      className="trending-tag-heat"
                      style={{ color: popularityColor(tag.popularity) }}
                    >
                      {'█'.repeat(Math.ceil(tag.popularity / 20))}
                      {' '}{tag.popularity}%
                    </span>
                  </div>
                  <p className="trending-tag-desc">{tag.description}</p>
                  {tag.examples.length > 0 && (
                    <div className="trending-tag-examples">
                      {tag.examples.map((ex, i) => (
                        <span key={i} className="trending-example">{ex}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
