'use client'

import { useState } from 'react'
import './content-publisher.css'

type Tab = 'substack' | 'instagram'

export default function ContentPublisherPage() {
  const [activeTab, setActiveTab] = useState<Tab>('substack')

  return (
    <div className="content-publisher">
      <h1 className="page-title">Content Publisher</h1>
      <div className="tab-bar">
        <button
          className={`tab ${activeTab === 'substack' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('substack')}
        >
          Substack
        </button>
        <button
          className={`tab ${activeTab === 'instagram' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('instagram')}
        >
          Instagram
        </button>
      </div>
      <div className="tab-content">
        {activeTab === 'substack' ? (
          <SubstackTool />
        ) : (
          <InstagramTool />
        )}
      </div>
    </div>
  )
}

function SubstackTool() {
  return (
    <div className="substack-tool">
      <p className="tool-description">Generate Substack drafts from your source text.</p>
      {/* Substack draft generator UI will be implemented here */}
    </div>
  )
}

function InstagramTool() {
  return (
    <div className="instagram-tool">
      <p className="tool-description">Create Instagram carousel slides from photos and text.</p>
      {/* Instagram carousel generator UI will be implemented here */}
    </div>
  )
}
