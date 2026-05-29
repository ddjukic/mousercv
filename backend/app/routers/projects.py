"""Project CRUD endpoints."""

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Project

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    """Schema for project creation."""

    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    """Schema for project updates -- all fields optional."""

    name: str | None = None
    description: str | None = None


@router.get("/")
def list_projects(session: Session = Depends(get_session)) -> list[Project]:
    """List all projects."""
    return list(session.exec(select(Project).order_by(Project.created_at.desc())).all())


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_project(
    data: ProjectCreate,
    session: Session = Depends(get_session),
) -> Project:
    """Create a new project."""
    project = Project(name=data.name, description=data.description)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.get("/{project_id}")
def get_project(
    project_id: int,
    session: Session = Depends(get_session),
) -> Project:
    """Get a single project by ID."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )
    return project


@router.put("/{project_id}")
def update_project(
    project_id: int,
    data: ProjectUpdate,
    session: Session = Depends(get_session),
) -> Project:
    """Update an existing project."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)

    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    session: Session = Depends(get_session),
) -> None:
    """Delete a project."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )
    session.delete(project)
    session.commit()
