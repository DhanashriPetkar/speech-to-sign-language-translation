import React from 'react';

const AvatarPlaceholder = () => (
  <section className="avatar-panel" aria-labelledby="avatar-heading">
    <div className="section-heading">
      <div>
        <p className="eyebrow">Future output</p>
        <h2 id="avatar-heading">3D ASL avatar</h2>
      </div>
      <span className="coming-badge">Planned</span>
    </div>

    <div className="avatar-placeholder">
      <div className="avatar-placeholder-mark" aria-hidden="true">3D</div>
      <strong>Avatar rendering will appear here</strong>
      <p>Word-level sign animations and a custom avatar will be added when verified assets are available.</p>
    </div>
  </section>
);

export default AvatarPlaceholder;
